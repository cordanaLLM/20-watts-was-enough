import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, syntheticProcessCounters, temporaryOutput } from "../lib/runner-test-helpers.mjs";
import { canonical, scientificPayload, sha256 } from "./contract.mjs";
import { analyzeFixture020, executeFixture020 as execute, validateFixture020Output } from "./runner.mjs";

function executeFixture020(options) {
  return execute({ ...options, counters: syntheticProcessCounters() });
}

const PINNED = [
  { seed: 1409351680, world_id: "ICP-T01-0x54010000",
    world_sha256: "1200ea85160742eaa406a6df6de3e1a34bbfa3fc220f75f53661b4873550800d",
    payload: "14c6ff473694721221d6c7cbceb85f884a45fc6c537dee3484f136788b291a0a",
    artifacts: { "world-manifest.json": "1028fb1dabb74b036e7371c90a5357b056b0e7ea729e9fd7bb2c422710552b90",
      "graph.json": "58e7a1d7383ac98b158a9240c0a73070d1e62048ffa1b2125174b249bfcb14e3",
      "demand.jsonl": "bab54074cb0136ca9858a59b84434fec0f227a193bd813f3aeae74e06aa6966a",
      "oxygen-ledger.jsonl": "599d59110b90e73438ef0119875446ca85513915b32233c089439fc94f82e0a7",
      "flows.json": "b6b6a9f76d2b2467db4ad64dd9c6175b27a5d6bdbf23affc755b671ecf711b7a",
      "observations.jsonl": "66cf429c8192e481033be949a54a680f43803a60972fe9f7359d4f354fc073ca",
      "fallbacks.jsonl": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" } },
  { seed: 1409351681, world_id: "ICP-T01-0x54010001",
    world_sha256: "960fa4ef182971c47c38bdb0ace3d9d9803f1661ef8208559a52bcbd1e9582ae",
    payload: "38201f6c4b04428e949f4b62134dc1ee7e2efcd4d1b85cc69ae2bf1b0cba8151",
    artifacts: { "world-manifest.json": "e82091504f368e934705857909e0a19cdb409116910b91b23c8298c36731019c",
      "graph.json": "1dca23afde21f5f23a26985f47056d2892622f765ac625b695611746360cfb47",
      "demand.jsonl": "4f01d567d5b945b2c8146b5d174cd3e28ab8eeccf0d07ca14a9d8c3037c847b8",
      "oxygen-ledger.jsonl": "ceab1462df1b25828d204a7d8ec35288009ad16598b541d32c985482c9b545e8",
      "flows.json": "385c6771cfd6ec62c60c3e5824a6add3378f887576f2778a76c7312c77ff237a",
      "observations.jsonl": "2e87f3451e7655441979b211e5dd4abd19eb7f0f3e7b1da54d9c4dbe75e30b2c",
      "fallbacks.jsonl": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" } },
];

const SUMMARY_SHA256 = "7055149a66f45a11e577101a8f8427395fe6f0957646753591cdc9185b2e7185";

test("T01 smoke byte stability: world and artifact digests match baseline 6209dd9e", async () => {
  const fixture = await temporaryOutput("fixture-020-t01-replay-");
  try {
    const result = await executeFixture020({ profile: "smoke", output: fixture.output });
    assert.equal(result.complete, true);
    const { readFile } = await import("node:fs/promises");
    const raw = (await readFile(`${fixture.output}/raw-events.jsonl`, "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(raw.length, 2);
    for (let i = 0; i < 2; i += 1) {
      const record = raw[i];
      const pinned = PINNED[i];
      assert.equal(record.world_id, pinned.world_id);
      assert.equal(record.world_sha256, pinned.world_sha256);
      for (const [name, digest] of Object.entries(pinned.artifacts)) {
        assert.equal(record.artifacts_sha256[name], digest, `${pinned.world_id} artifact ${name}`);
      }
      const stripped = scientificPayload(record);
      delete stripped.run_id;
      assert.equal(sha256(canonical(stripped)), pinned.payload, `${pinned.world_id} payload`);
    }
    const summary = await analyzeFixture020(fixture.output);
    const summaryStripped = { ...summary };
    delete summaryStripped.run_id;
    assert.equal(sha256(canonical(summaryStripped)), SUMMARY_SHA256);
    assert.equal((await validateFixture020Output(fixture.output)).valid, true);
  } finally { await cleanup(fixture); }
});
