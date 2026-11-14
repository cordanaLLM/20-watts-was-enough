import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ARTIFACT_FILES, assertFixture020Record, canonical, EVALUATION_KEYS,
  EVALUATION_NUMBERS, FIXTURE_020_EVENT_CONTRACT_VERSION, NO_RESULT, scientificPayload,
  sha256, validateFixture020Config, worldId } from "./contract.mjs";

function record() {
  const evaluation = { ...Object.fromEntries(EVALUATION_NUMBERS.map((key) => [key, 0])),
    loss_mmol: 10, maximum_loss_mmol: 10, failure_reason: "missing-output", terminated: true,
    deprived_episode_durations_min: [], oxygen_ledger_sha256: sha256(""), flows_sha256: sha256("") };
  return rehash({ schema: 1, contract_version: FIXTURE_020_EVENT_CONTRACT_VERSION,
    artifact: "fixture-020", track: "ICP-T01", run_id: "a".repeat(64), profile: "smoke",
    pack: "public-development", seed: 0x54010000, world_id: worldId(0x54010000),
    world_sha256: "b".repeat(64), arm: "A", maximum_loss_mmol: 10, loss_mmol: 10,
    failure_reason: "missing-output", evaluation, execution_stop: null,
    artifacts_sha256: Object.fromEntries(ARTIFACT_FILES.map((name) => [name, "c".repeat(64)])), ...NO_RESULT });
}

function rehash(value) {
  const previous = "0".repeat(64);
  value.integrity = { sequence: 0, previous_sha256: previous,
    record_sha256: sha256(`${previous}\n${canonical(scientificPayload(value))}`) };
  return value;
}

test("closed runtime event binds identity, terminal loss, authority and hash chain", () => {
  const valid = record();
  assert.equal(assertFixture020Record(valid, { sequence: 0, previousHash: "0".repeat(64) }), valid);
  const mutate = [
    (value) => { value.claim_eligible = true; },
    (value) => { value.loss_mmol = 9; },
    (value) => { value.world_id = worldId(0x54010001); },
    (value) => { value.evaluation.oracle = 1; },
    (value) => { value.artifacts_sha256.extra = "d".repeat(64); },
  ];
  for (const mutation of mutate) {
    const forged = structuredClone(valid);
    mutation(forged);
    assert.throws(() => assertFixture020Record(rehash(forged)), /ICP-T01/);
  }
  assert.throws(() => assertFixture020Record({ ...valid, oracle: true }), /fields are not closed/);
  assert.throws(() => assertFixture020Record(valid, { context: { run_id: "d".repeat(64), profile: "smoke" } }), /fresh run identity/);
  assert.throws(() => assertFixture020Record({ ...valid, loss_mmol: 0 }), /terminal loss/);
  assert.throws(() => assertFixture020Record(valid, { sequence: 1 }), /hash chain/);
});

test("the event digest rejects unchanged payload with a forged hash", () => {
  const badHash = record();
  badHash.integrity.record_sha256 = "f".repeat(64);
  assert.throws(() => assertFixture020Record(badHash), /hash chain digest/);
});

test("output schema is closed and agrees structurally with the runtime event", async () => {
  const schema = JSON.parse(await readFile(new URL("./output.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual([...schema.required].sort(), Object.keys(record()).sort());
  assert.deepEqual(Object.keys(schema.properties).sort(), [...schema.required].sort());
  assert.equal(schema.properties.evaluation.additionalProperties, false);
  assert.deepEqual([...schema.properties.evaluation.required].sort(), [...EVALUATION_KEYS].sort());
  assert.equal(schema["x-runtime-validator"].contract_version, FIXTURE_020_EVENT_CONTRACT_VERSION);
  assert.deepEqual(schema.properties.protocol_outcome, { const: "NO_RESULT" });
});

test("profiles preserve full spatial/time contract, public seed counts and finite caps", async () => {
  for (const profile of ["smoke", "development"]) {
    const config = JSON.parse(await readFile(new URL(`./configs/${profile}.json`, import.meta.url), "utf8"));
    assert.equal(validateFixture020Config(config), config);
    assert.throws(() => validateFixture020Config({ ...config, minutes: 1 }), /frozen bounds/);
    assert.throws(() => validateFixture020Config({ ...config, oracle: true }), /fields are not closed/);
  }
  const reveal = JSON.parse(await readFile(new URL("./seeds/development.reveal.json", import.meta.url), "utf8"));
  assert.equal(reveal.seeds.length, 64);
  assert.equal(reveal.seeds[0], 0x54010000);
  assert.equal(reveal.seeds.at(-1), 0x5401003f);
  for (const partition of ["confirmation", "transfer"]) {
    const unavailable = JSON.parse(await readFile(new URL(`./seeds/${partition}.unavailable.json`, import.meta.url), "utf8"));
    assert.equal(unavailable.contains_seeds, false);
    assert.equal(unavailable.contains_commitment, false);
    assert.equal(unavailable.state, "not-created");
  }
});
