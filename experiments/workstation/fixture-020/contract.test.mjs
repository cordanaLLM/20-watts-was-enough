import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createAjv } from "../lib/ajv.mjs";
import { ARTIFACT_FILES, assertFixture020Record, assertFixture020Summary, canonical, EVALUATION_KEYS,
  EVALUATION_NUMBERS, FAILURE_REASONS, FIXTURE_020_EVENT_CONTRACT_VERSION, NO_RESULT, scientificPayload,
  sha256, validateFixture020Config, worldId } from "./contract.mjs";
import { loadInputs } from "./inputs.mjs";
import { assertT02CalibrationRecord, assertT02Record, assertT02Summary, T02_ARTIFACT_FILES,
  T02_EVALUATION_KEYS, T02_EVALUATION_NUMBERS, T02_EVENT_CONTRACT_VERSION, T02_FAILURE_REASONS,
  T02_L_MAX, t02WorldId, validateT02Config } from "./t02-contract.mjs";
import { developmentCalibration } from "./t02-policy.mjs";
import { assertEventRecord, getTrack } from "./tracks.mjs";

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

function t02Record() {
  const evaluation = { ...Object.fromEntries(T02_EVALUATION_NUMBERS.map((key) => [key, 0])),
    loss_j: 3600, maximum_loss_j: T02_L_MAX, objective_w: 1, failure_reason: null,
    design_sha256: sha256("") };
  return rehash({ schema: 1, contract_version: T02_EVENT_CONTRACT_VERSION,
    artifact: "fixture-020", track: "ICP-T02", run_id: "a".repeat(64), profile: "smoke",
    pack: "public-development", seed: 0x54020000, world_id: t02WorldId(0x54020000),
    world_sha256: "b".repeat(64), regime: "classic", arm: "A",
    maximum_loss_j: T02_L_MAX, loss_j: 3600, failure_reason: null, evaluation, execution_stop: null,
    artifacts_sha256: Object.fromEntries(T02_ARTIFACT_FILES.map((name) => [name, "c".repeat(64)])), ...NO_RESULT });
}

function rehash(value) {
  const previous = "0".repeat(64);
  value.integrity = { sequence: 0, previous_sha256: previous,
    record_sha256: sha256(`${previous}\n${canonical(scientificPayload(value))}`) };
  return value;
}

function sampleSummaries() {
  const base = { schema: 1, artifact: "fixture-020", run_id: "a".repeat(64), profile: "smoke",
    partition: "public-development-only", readiness: "smoke-ready", attempted_worlds: 2,
    retained_worlds: 2, retained_failures: 0, confirmation_partition_present: false,
    transfer_partition_present: false, ...NO_RESULT };
  return {
    t01: { ...base, track: "ICP-T01", loss_unit: "mmol", resource_unit: "synthetic J" },
    t02: { ...base, track: "ICP-T02", loss_unit: "J", resource_unit: "objective evaluations",
      regime_counts: { classic: 1, rheology: 1, pulsatile: 0, "wall-floor": 0 },
      development_calibration: developmentCalibration() },
  };
}

function schemaValidators(declared) {
  const copy = { ...declared };
  delete copy.$schema;
  const ajv = createAjv({ allErrors: true });
  ajv.addSchema(copy);
  const event = ajv.getSchema(copy.$id);
  const identity = ajv.getSchema(`${copy.$id}#/$defs/identity`);
  const summary = ajv.getSchema(`${copy.$id}#/$defs/summary`);
  assert.equal(typeof event, "function");
  assert.equal(typeof identity, "function");
  assert.equal(typeof summary, "function");
  return { event, identity, summary };
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
  for (let i = 0; i < mutate.length; i += 1) {
    const forged = structuredClone(valid);
    mutate[i](forged);
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
  assert.ok(Array.isArray(schema.oneOf), "top-level oneOf discriminated union");
  const t01 = schema.$defs.t01Event;
  assert.equal(t01.additionalProperties, false);
  assert.deepEqual([...t01.required].sort(), Object.keys(record()).sort());
  assert.deepEqual(Object.keys(t01.properties).sort(), [...t01.required].sort());
  assert.equal(t01.properties.evaluation.additionalProperties, false);
  assert.deepEqual([...t01.properties.evaluation.required].sort(), [...EVALUATION_KEYS].sort());
  assert.equal(t01["x-runtime-validator"].contract_version, FIXTURE_020_EVENT_CONTRACT_VERSION);
  assert.deepEqual(t01.properties.protocol_outcome, { const: "NO_RESULT" });
  assert.deepEqual(t01.properties.failure_reason.enum, [null, ...FAILURE_REASONS]);
  assert.deepEqual(t01.properties.evaluation.properties.failure_reason.enum, [null, ...FAILURE_REASONS]);

  const t02 = schema.$defs.t02Event;
  assert.equal(t02.additionalProperties, false);
  assert.deepEqual([...t02.required].sort(), Object.keys(t02Record()).sort());
  assert.deepEqual(Object.keys(t02.properties).sort(), [...t02.required].sort());
  assert.equal(t02.properties.seed.minimum, 0x54020000);
  assert.equal(t02.properties.seed.maximum, 0x5402003f);
  assert.deepEqual([...t02.properties.evaluation.required].sort(), [...T02_EVALUATION_KEYS].sort());
  assert.deepEqual(t02.properties.failure_reason.enum, [null, ...T02_FAILURE_REASONS]);
});

test("output schema closed identity, event, and summary shapes accept T01/T02 and refuse extra keys", async () => {
  const schema = JSON.parse(await readFile(new URL("./output.schema.json", import.meta.url), "utf8"));
  const validate = schemaValidators(schema);
  const idT01 = await loadInputs("smoke", "ICP-T01");
  const idT02 = await loadInputs("smoke", "ICP-T02");
  const evT01 = record();
  const evT02 = t02Record();
  const { t01: sumT01, t02: sumT02 } = sampleSummaries();
  assert.equal(validate.identity(idT01), true, JSON.stringify(validate.identity.errors));
  assert.equal(validate.identity(idT02), true, JSON.stringify(validate.identity.errors));
  assert.equal(validate.event(evT01), true, JSON.stringify(validate.event.errors));
  assert.equal(validate.event(evT02), true, JSON.stringify(validate.event.errors));
  assert.equal(validate.summary(sumT01), true, JSON.stringify(validate.summary.errors));
  assert.equal(validate.summary(sumT02), true, JSON.stringify(validate.summary.errors));

  assert.equal(validate.identity({ ...idT02, extra: 1 }), false);
  assert.equal(validate.identity({ ...idT02, config: { ...idT02.config, extra: 1 } }), false);
  assert.equal(validate.event({ ...evT02, extra: 1 }), false);
  assert.equal(validate.event({ ...evT02, evaluation: { ...evT02.evaluation, extra: 1 } }), false);
  assert.equal(validate.event({ ...evT02, seed: 0x5401ffff }), false);
  assert.equal(validate.event({ ...evT02, seed: 0x54020040 }), false);
  assert.equal(validate.summary({ ...sumT02, extra: 1 }), false);
  assert.equal(validate.summary(
    { ...sumT02, development_calibration: { ...sumT02.development_calibration, extra: 1 } },
  ), false);
  assert.equal(validate.summary({ ...sumT01, regime_counts: sumT02.regime_counts }), false);
  assert.equal(validate.summary({ ...sumT02, run_id: "z".repeat(64) }), false);
  assert.equal(validate.event(rehash({ ...evT02, world_id: "ICP-T02-0x54020040" })), false);
});

test("T02 runtime validators enforce closed records, summaries, configs, seeds, and track dispatch", async () => {
  assert.equal(t02WorldId(0x54020000), "ICP-T02-0x54020000");
  assert.equal(t02WorldId(0x5402003f), "ICP-T02-0x5402003f");
  assert.throws(() => t02WorldId(0x54010000), /registered public seed/);
  assert.throws(() => getTrack("toString"), /unknown track/);
  assert.throws(() => assertEventRecord({ track: "toString" }), /unknown track/);

  const valid = t02Record();
  assert.equal(assertEventRecord(valid), valid);
  assert.throws(() => assertT02Record({ ...valid, extra: 1 }), /fields are not closed/);
  const floatCount = structuredClone(valid);
  floatCount.evaluation.evaluations = 1.5;
  assert.throws(() => assertT02Record(rehash(floatCount)), /evaluation fields or amounts invalid/);

  const { t01: sumT01, t02: sumT02 } = sampleSummaries();
  assert.equal(assertFixture020Summary(sumT01), sumT01);
  assert.equal(assertT02Summary(sumT02), sumT02);
  assert.throws(() => assertT02Summary({ ...sumT02, extra: 1 }), /summary fields are not closed/);
  assert.throws(() => assertT02CalibrationRecord({ ...sumT02.development_calibration, alpha_relative_error: 1e-5 }),
    /development calibration invalidates/);

  for (const profile of ["smoke", "development"]) {
    const cfg = JSON.parse(await readFile(new URL(`./configs/t02-${profile}.json`, import.meta.url), "utf8"));
    assert.equal(validateT02Config(cfg), cfg);
    assert.throws(() => validateT02Config({ ...cfg, extra: 1 }), /fields are not closed/);
    assert.throws(() => validateT02Config({ ...cfg, max_wall_ms: 0 }), /frozen bounds/);
  }
});

test("new generation reasons validate and unknown failure reasons remain rejected", () => {
  for (const reason of ["hotspot-placement", "max-flow-bound"]) {
    const value = record();
    value.failure_reason = reason;
    value.evaluation.failure_reason = reason;
    assert.equal(assertFixture020Record(rehash(value)), value);
  }
  const value = record();
  value.failure_reason = "unknown-generation-failure";
  value.evaluation.failure_reason = value.failure_reason;
  assert.throws(() => assertFixture020Record(rehash(value)), /failure reason invalid/);
});

test("profiles preserve full spatial/time contract, public seed counts and finite caps", async () => {
  for (const profile of ["smoke", "development"]) {
    const config = JSON.parse(await readFile(new URL(`./configs/${profile}.json`, import.meta.url), "utf8"));
    assert.equal(validateFixture020Config(config), config);
    assert.equal(config.memory_bytes, profile === "smoke" ? 134217728 : 268435456);
    assert.throws(() => validateFixture020Config({ ...config, minutes: 1 }), /frozen bounds/);
    assert.throws(() => validateFixture020Config({ ...config, oracle: true }), /fields are not closed/);
  }
  const reveal = JSON.parse(await readFile(new URL("./seeds/development.reveal.json", import.meta.url), "utf8"));
  assert.equal(reveal.seeds.length, 64);
  assert.equal(reveal.seeds[0], 0x54010000);
  assert.equal(reveal.seeds.at(-1), 0x5401003f);
  const t02Reveal = JSON.parse(await readFile(new URL("./seeds/t02-development.reveal.json", import.meta.url), "utf8"));
  assert.equal(t02Reveal.seeds.length, 64);
  assert.equal(t02Reveal.seeds[0], 0x54020000);
  assert.equal(t02Reveal.seeds.at(-1), 0x5402003f);
  for (const partition of ["confirmation", "transfer"]) {
    const unavailable = JSON.parse(await readFile(new URL(`./seeds/${partition}.unavailable.json`, import.meta.url), "utf8"));
    assert.equal(unavailable.contains_seeds, false);
    assert.equal(unavailable.contains_commitment, false);
    assert.equal(unavailable.state, "not-created");
    assert.match(unavailable.reason, /ICP-T01 and ICP-T02/);
  }
});

test("profiles reject memory caps outside their frozen value", async () => {
  for (const [profile, memory_bytes] of [["development", 134217728], ["smoke", 268435456],
    ["development", 268435457]]) {
    const config = JSON.parse(await readFile(new URL(`./configs/${profile}.json`, import.meta.url), "utf8"));
    assert.throws(() => validateFixture020Config({ ...config, memory_bytes }), /frozen bounds/);
  }
});
