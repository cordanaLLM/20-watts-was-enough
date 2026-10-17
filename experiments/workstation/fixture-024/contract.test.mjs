import assert from "node:assert/strict";
import test from "node:test";

import {
  FIXTURE_024_EVENT_CONTRACT_VERSION,
  assertFixture024Record,
  canonical,
  fixture024ScientificPayload,
  sha256,
} from "./contract.mjs";
import {
  Pcg64Dxsm,
  generateLinearMemorySystems,
  stepLinearState,
  transitionMatrix,
  validateFixture024Config,
} from "./generator.mjs";

const smokeConfig = Object.freeze({
  schema: 1,
  artifact: "fixture-024",
  profile: "smoke",
  opportunities_per_seed: 2,
  time_step_s: 0.05,
  prefix_s: 1,
  horizon_s: 4,
  memory_window_s: 0.8,
  state_scale_u: 2,
  max_loss: 100,
});

function fixture(previous = "0".repeat(64), sequence = 0) {
  const payload = {
    schema: 1,
    contract_version: FIXTURE_024_EVENT_CONTRACT_VERSION,
    artifact: "fixture-024",
    track: "AMR-T01",
    run_id: "a".repeat(64),
    profile: "smoke",
    pack: "public-development",
    seed: 1536001,
    system_index: 0,
    world_id: "1536001:0",
    arm: "finite-memory",
    attempt: 0,
    units: { state: "U", time: "s", rate: "s^-1", kernel: "s^-2" },
    input_sha256: {
      audit: "1".repeat(64),
      fixture: "2".repeat(64),
      math_contract: "3".repeat(64),
      runner: "4".repeat(64),
      configuration: "5".repeat(64),
      schema: "6".repeat(64),
    },
    parameters: {
      alpha_per_s: 1,
      beta_per_s: 0.5,
      gamma_per_s: 0.25,
      lambda_per_s: 1,
      determinant_per_s2: 0.875,
    },
    prefix_end_s: 1,
    horizon_s: 4,
    memory_window_s: 0.8,
    final_x_u: 0.25,
    rmse_u: 0.1,
    max_abs_error_u: 0.2,
    loss: 5,
    steps: 60,
    history_terms: 32,
    multiply_add_equivalents: 672,
    bytes_read: 736,
    bytes_written: 488,
    status: "development-smoke-only",
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    scientific_result: false,
    performance_result: false,
  };
  return {
    ...payload,
    integrity: {
      sequence,
      previous_sha256: previous,
      record_sha256: sha256(`${previous}\n${canonical(payload)}`),
    },
  };
}

test("PCG64-DXSM initialization has a frozen public-seed golden sequence", () => {
  const random = new Pcg64Dxsm(1536001);
  assert.equal(random.nextUint64().toString(16), "53453339a1008e08");
  assert.equal(random.nextUint64().toString(16), "d216eaf00c4281f3");
});

test("linear generator is deterministic, bounded, and stability qualified", () => {
  assert.equal(validateFixture024Config(smokeConfig), smokeConfig);
  const left = generateLinearMemorySystems({ seed: 1536001, config: smokeConfig });
  const right = generateLinearMemorySystems({ seed: 1536001, config: smokeConfig });
  assert.deepEqual(left, right);
  assert.equal(left.length, 2);
  assert.ok(left.every((system) => system.determinant_per_s2 >= 0.15));
  const matrix = transitionMatrix(left[0], smokeConfig.time_step_s);
  const stepped = stepLinearState(matrix, [left[0].x0_u, left[0].y0_u]);
  assert.ok(matrix.every(Number.isFinite));
  assert.ok(stepped.every(Number.isFinite));
});

test("raw event contract binds units, authority, sequence, and hash chain", () => {
  const first = fixture();
  assert.equal(assertFixture024Record(first, { sequence: 0, previousHash: "0".repeat(64) }), first);
  const second = fixture(first.integrity.record_sha256, 1);
  assert.equal(assertFixture024Record(second, {
    sequence: 1,
    previousHash: first.integrity.record_sha256,
  }), second);
  assert.throws(
    () => assertFixture024Record({ ...second, rmse_u: 0.11 }, {
      sequence: 1,
      previousHash: first.integrity.record_sha256,
    }),
    /runtime contract/,
  );
  const authorityClaim = fixture();
  authorityClaim.claim_eligible = true;
  authorityClaim.integrity.record_sha256 = sha256(
    `${"0".repeat(64)}\n${canonical(fixture024ScientificPayload(authorityClaim))}`,
  );
  assert.throws(() => assertFixture024Record(authorityClaim), /runtime contract/);
});

test("planted failure: proves the packed CI job names this fixture", () => {
  assert.equal(1, 2);
});
